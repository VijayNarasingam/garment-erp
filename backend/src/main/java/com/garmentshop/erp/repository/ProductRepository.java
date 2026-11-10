package com.garmentshop.erp.repository;

import com.garmentshop.erp.domain.Product;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface ProductRepository extends JpaRepository<Product, Long> {

    Optional<Product> findByIdAndBusinessId(Long id, Long businessId);

    boolean existsByBusinessIdAndCodeIgnoreCase(Long businessId, String code);

    @Query("""
            select distinct p from Product p
            left join p.category c
            left join p.brand b
            where p.business.id = :businessId
              and (:active is null or p.active = :active)
              and (:categoryId is null or c.id = :categoryId)
              and (:q is null or lower(p.name) like lower(concat('%', :q, '%'))
                   or lower(p.code) like lower(concat('%', :q, '%')))
            """)
    Page<Product> search(@Param("businessId") Long businessId, @Param("q") String q,
                         @Param("categoryId") Long categoryId, @Param("active") Boolean active,
                         Pageable pageable);

    long countByBusinessIdAndActiveTrue(Long businessId);
}
