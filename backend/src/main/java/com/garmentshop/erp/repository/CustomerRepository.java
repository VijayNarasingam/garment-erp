package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.Customer;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface CustomerRepository extends JpaRepository<Customer, Long> {

    List<Customer> findByBusinessIdOrderByNameAsc(Long businessId);

    Optional<Customer> findByIdAndBusinessId(Long id, Long businessId);

    boolean existsByBusinessIdAndCodeIgnoreCase(Long businessId, String code);

    long countByBusinessId(Long businessId);

    @Query("""
            select c from Customer c
            where c.business.id = :businessId
              and (:active is null or c.active = :active)
              and (:q is null or lower(c.name) like lower(concat('%', :q, '%'))
                   or lower(c.code) like lower(concat('%', :q, '%'))
                   or c.phone like concat('%', :q, '%'))
            order by c.name
            """)
    Page<Customer> search(@Param("businessId") Long businessId, @Param("q") String q,
                          @Param("active") Boolean active, Pageable pageable);

    @Query("select c from Customer c where c.business.id = :businessId and c.phone = :phone and c.active = true")
    List<Customer> findByPhone(@Param("businessId") Long businessId, @Param("phone") String phone);

    List<Customer> findByBusiness_IdAndUpdatedAtAfterOrderByNameAsc(Long businessId, java.time.Instant since);
}
